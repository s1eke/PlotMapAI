import { loadArchitectureContract } from './contracts.mjs';

function createRestrictedImportPatterns(patterns) {
  return [
    'error',
    {
      patterns,
    },
  ];
}

function getLayer(contract, layerName) {
  const layer = contract.layers.find((entry) => entry.name === layerName);
  if (!layer) {
    throw new Error(`Unknown architecture layer: ${layerName}`);
  }

  return layer;
}

function buildDefaultDomainPatterns(contract) {
  const domainLayer = getLayer(contract, 'domains');
  const patterns = [];

  if (!domainLayer.canDependOn.includes('app')) {
    patterns.push({
      group: ['@app/*', '@app/*/*'],
      message: '领域层代码不能依赖应用层代码。',
    });
  }

  if (!domainLayer.canDependOn.includes('application')) {
    patterns.push({
      group: ['@application/*', '@application/*/*'],
      message: '领域层代码不能依赖业务逻辑层代码。',
    });
  }

  if (!domainLayer.canDependOn.includes('domains')) {
    patterns.push({
      group: ['@domains/*'],
      message: '领域内部不能相互依赖。',
    });
    patterns.push({
      group: ['@domains/*/*'],
      message: '领域层代码不能依赖其他领域的内部实现。',
    });
  }

  return patterns;
}

function buildSharedInfraPatterns(contract) {
  const sharedLayer = getLayer(contract, 'shared');
  const infraLayer = getLayer(contract, 'infra');
  if (sharedLayer.canDependOn.includes('domains') || infraLayer.canDependOn.includes('domains')) {
    return [];
  }

  return [{
    group: [
      '@domains/*',
      '@domains/*/*',
      '../domains/*',
      '../domains/*/*',
      '../../domains/*',
      '../../domains/*/*',
      '../../../domains/*',
      '../../../domains/*/*',
    ],
    message: '共享层和基础设施层不能依赖领域层代码。',
  }];
}

export function buildArchitectureLintConfigs() {
  const contract = loadArchitectureContract();
  const domainLayer = getLayer(contract, 'domains');
  const sharedLayer = getLayer(contract, 'shared');
  const infraLayer = getLayer(contract, 'infra');
  const readerFamilyFiles = contract.rules.readerFamily.files;

  return [
    {
      files: contract.rules.domainEntryConsumers.files,
      rules: {
        'no-restricted-imports': createRestrictedImportPatterns([{
          group: [contract.rules.domainEntryConsumers.restrictedSubpathPattern],
          message: contract.rules.domainEntryConsumers.message,
        }]),
      },
    },
    ...contract.rules.specialInfraDbRestrictions.map((restriction) => ({
      files: restriction.files,
      ...(restriction.ignores.length > 0 ? { ignores: restriction.ignores } : {}),
      rules: {
        'no-restricted-imports': createRestrictedImportPatterns([{
          group: restriction.restrictedImports,
          message: restriction.message,
        }]),
      },
    })),
    {
      files: readerFamilyFiles,
      rules: {
        'no-restricted-imports': createRestrictedImportPatterns(
          contract.rules.readerFamily.restrictedImports,
        ),
      },
    },
    {
      files: [`${domainLayer.root}/**/*.{ts,tsx}`],
      ignores: readerFamilyFiles,
      rules: {
        'no-restricted-imports': createRestrictedImportPatterns(
          buildDefaultDomainPatterns(contract),
        ),
      },
    },
    {
      files: [`${sharedLayer.root}/**/*.{ts,tsx}`, `${infraLayer.root}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': createRestrictedImportPatterns(
          buildSharedInfraPatterns(contract),
        ),
      },
    },
  ];
}

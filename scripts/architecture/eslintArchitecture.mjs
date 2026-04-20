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
      message: 'domain code must not depend on app code.',
    });
  }

  if (!domainLayer.canDependOn.includes('application')) {
    patterns.push({
      group: ['@application/*', '@application/*/*'],
      message: 'domain code must not depend on application code.',
    });
  }

  if (!domainLayer.canDependOn.includes('domains')) {
    patterns.push({
      group: ['@domains/*'],
      message: 'domain code must not depend on other domains.',
    });
    patterns.push({
      group: ['@domains/*/*'],
      message: 'domain code must not depend on other domain internals.',
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
    message: 'shared and infra must not depend on domain code.',
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

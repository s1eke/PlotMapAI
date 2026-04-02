import type { ReactElement } from 'react';

import { useParams } from 'react-router-dom';

import CharacterGraphScreen from './CharacterGraphScreen';
import { useCharacterGraphPageViewModel } from './useCharacterGraphPageViewModel';

export default function CharacterGraphPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);
  const viewModel = useCharacterGraphPageViewModel(novelId);

  return <CharacterGraphScreen viewModel={viewModel} />;
}

import { useParams } from 'react-router-dom';

import ReaderPageContainer from './reader-page/ReaderPageContainer';
import { ReaderProvider } from './reader-page/ReaderContext';

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  return (
    <ReaderProvider novelId={novelId}>
      <ReaderPageContainer novelId={novelId} />
    </ReaderProvider>
  );
}

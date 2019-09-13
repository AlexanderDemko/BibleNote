using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.FileSystem.DocumentId
{
    public class FileDocumentId : IDocumentId
    {
        public int DocumentId { get; private set; }

        public string FilePath { get; private set; }

        public bool IsReadonly { get; private set; }

        public bool Changed { get; private set; }

        public FileDocumentId(int documentId, string filePath, bool isReadonly)
        {
            DocumentId = documentId;
            FilePath = filePath;
            IsReadonly = isReadonly;
        }

        public void SetChanged()
        {
            Changed = true;
        }
    }
}

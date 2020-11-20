using System;
using System.Threading.Tasks;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.Word.Contracts;
using BibleNote.Services.Contracts;
using DocumentFormat.OpenXml.Packaging;

namespace BibleNote.Providers.Word
{
    public class WordDocumentHandler : IWordDocumentHandler
    {
        public WordprocessingDocument WordDocument { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public WordDocumentHandler(IDocumentId documentId)
        {
            DocumentId = documentId;
        }

        public void LoadPageContent()
        {
            WordDocument = ReadDocument(DocumentId);
        }

        private static WordprocessingDocument ReadDocument(IDocumentId documentId)
        {
            if (!(documentId is FileDocumentId fileDocumentId))
                throw new NotSupportedException(documentId.GetType().Name);

            var filePath = fileDocumentId.FilePath;
            return WordprocessingDocument.Open(filePath, !documentId.IsReadonly);
        }

        public void SetDocumentChanged()
        {
            DocumentId.SetChanged();
        }  

        public async ValueTask DisposeAsync()
        {
            WordDocument.Dispose();

            //todo: save if changed
        }
    }
}

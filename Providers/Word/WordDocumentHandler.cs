using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using DocumentFormat.OpenXml.Packaging;
using System;

namespace BibleNote.Analytics.Providers.Html
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

        public void Dispose()
        {
            WordDocument.Dispose();

            //todo: save if changed
        }
    }
}

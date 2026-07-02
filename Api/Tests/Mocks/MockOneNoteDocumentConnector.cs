using System;
using System.IO;
using System.Threading.Tasks;
using System.Xml.Linq;
using BibleNote.Common.Helpers;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Services.Contracts;

namespace BibleNote.Tests.Mocks
{
    public class MockOneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        public async Task<IXDocumentHandler> ConnectAsync(IDocumentId documentId)
        {
            return new MockOneNoteDocumentHandler(documentId);
        }
    }

    public class MockOneNoteDocumentHandler : IXDocumentHandler
    {
        public XDocument Document { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public MockOneNoteDocumentHandler(IDocumentId documentId)
        {
            DocumentId = documentId;
            Document = ReadDocument(DocumentId);
        }

        private static XDocument ReadDocument(IDocumentId documentId)
        {
            string xml = null;

            if (documentId is FileDocumentId)
            {
                var filePath = ((FileDocumentId)documentId).FilePath;
                var ext = Path.GetExtension(filePath);
                xml = File.ReadAllText(filePath);
            }

            if (xml != null)
                return XDocument.Parse(xml);

            throw new NotSupportedException(documentId.GetType().Name);
        }

        public void SetDocumentChanged()
        {
            DocumentId.SetChanged();
        }    

        public async ValueTask DisposeAsync()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                var filePath = ((FileDocumentId)DocumentId).FilePath;
                Document.Save(filePath);
            }
        }
    }
}

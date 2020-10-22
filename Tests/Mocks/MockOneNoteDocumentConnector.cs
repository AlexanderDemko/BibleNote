﻿using BibleNote.Analytics.Common.Helpers;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System;
using System.IO;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Tests.Analytics.Mocks
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

        public void Dispose()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                var filePath = ((FileDocumentId)DocumentId).FilePath;
                var ext = Path.GetExtension(filePath);
                var encoding = FileUtils.GetEncoding(filePath);
                Document.Save(filePath);
            }
        }
    }
}

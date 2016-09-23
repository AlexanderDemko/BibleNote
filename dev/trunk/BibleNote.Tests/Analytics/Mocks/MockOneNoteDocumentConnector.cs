using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using HtmlAgilityPack;
using System.IO;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Providers.Html;
using System.Text.RegularExpressions;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockOneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        public IHtmlDocumentHandler Connect(IDocumentId documentId)
        {
            return new MockOneNoteDocumentHandler(documentId);
        }
    }

    public class MockOneNoteDocumentHandler : IHtmlDocumentHandler
    {
        public HtmlDocument HtmlDocument { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public MockOneNoteDocumentHandler(IDocumentId documentId)
        {
            DocumentId = documentId;
            HtmlDocument = ReadDocument(DocumentId);
        }

        private static HtmlDocument ReadDocument(IDocumentId documentId)
        {
            string html = null;

            if (documentId is FileDocumentId)
            {
                var filePath = ((FileDocumentId)documentId).FilePath;
                var ext = Path.GetExtension(filePath);
                html = File.ReadAllText(filePath);
                //html = Regex.Replace(html, "([^>])(\\n|&nbsp;)([^<])", "$1 $3");
                html = Regex.Replace(html, @"(<!\[CDATA\[)(((?!one:)[\s\S])*)(]]>)", "$2");                
            }

            if (html != null)
            {
                var htmlDoc = new HtmlDocument();
                htmlDoc.LoadHtml(html);
                return htmlDoc;
            }

            throw new NotSupportedException(documentId.GetType().Name);
        }

        public void SetDocumentChanged()
        {
            DocumentId.Changed = true;
        }

        public void Dispose()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                var filePath = ((FileDocumentId)DocumentId).FilePath;
                var ext = Path.GetExtension(filePath);
                var encoding = FileUtils.GetEncoding(filePath);
                HtmlDocument.Save(filePath, encoding);
            }
        }
    }
}

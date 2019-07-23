using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Providers.Web.Navigation;
using HtmlAgilityPack;
using System;
using System.IO;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlDocumentHandler : IHtmlDocumentHandler
    {
        public HtmlDocument HtmlDocument { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public HtmlDocumentHandler(IDocumentId documentId)
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

                if (ext == ".txt")
                {
                    //todo: надо обернуть каждый обзац в <p></p>
                }
            }
            else if (documentId is WebDocumentId)
            {
                throw new NotImplementedException();
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

                if (ext != ".txt")      // todo: не нравится мне так проверять. Надо как-то лучше продумать, как суммировать всю иерархию IsReadonly
                {
                    var encoding = FileUtils.GetEncoding(filePath);
                    HtmlDocument.Save(filePath, encoding);
                }
            }
        }
    }
}

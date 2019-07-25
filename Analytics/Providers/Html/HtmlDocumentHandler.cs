using BibleNote.Analytics.Common.Helpers;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Providers.Web.Navigation;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
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

            if (documentId is FileDocumentId fileDocumentId)
            {
                var filePath = fileDocumentId.FilePath;
                var ext = Path.GetExtension(filePath);
                html = File.ReadAllText(filePath);

                if (ext == ".txt")
                {
                    //todo: надо обернуть каждый обзац в <p></p>
                    //и надо по-другому проверять, что файл содержит только текст
                }
            }
            else if (documentId is WebDocumentId webDocumentId)
            {
                throw new NotImplementedException();
            }
            else
            {
                throw new NotSupportedException(documentId.GetType().Name);
            }

            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(html);
            return htmlDoc;
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

                if (ext != ".txt")      // todo: не нравится мне так проверять. Надо как-то лучше продумать, как суммировать всю иерархию IsReadonly
                {
                    var encoding = FileUtils.GetEncoding(filePath);
                    HtmlDocument.Save(filePath, encoding);
                }
            }
        }
    }
}

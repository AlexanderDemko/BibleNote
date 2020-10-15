using BibleNote.Analytics.Common.Helpers;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Providers.Web.DocumentId;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using HtmlAgilityPack;
using System;
using System.IO;
using System.Linq;
using System.Net;

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
                    html = string.Concat(
                        html.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries)
                            .Select(p => $"<p>{p}</p>"));

                    //todo: надо по-другому проверять, что файл содержит только текст
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

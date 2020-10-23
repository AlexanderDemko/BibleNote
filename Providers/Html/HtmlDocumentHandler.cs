using BibleNote.Analytics.Common.Helpers;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Providers.Web.DocumentId;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using HtmlAgilityPack;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Web;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlDocumentHandler : IHtmlDocumentHandler
    {
        public HtmlDocument HtmlDocument { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public HtmlDocumentHandler(IDocumentId documentId)
        {
            DocumentId = documentId;           
        }

        public async Task LoadPageContentAsync()
        {
            HtmlDocument = await ReadDocumentAsync(DocumentId);
        }

        private static async Task<HtmlDocument> ReadDocumentAsync(IDocumentId documentId)
        {
            string fileContent = null;

            if (documentId is FileDocumentId fileDocumentId)
            {
                var filePath = fileDocumentId.FilePath;
                fileContent = File.ReadAllText(filePath);

                if (!StringUtils.ContainsHtml(fileContent))
                {
                    fileContent = string.Concat(
                        fileContent.Split(new string[] { Environment.NewLine, "\n" }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(p => $"<p>{p}</p>"));

                    documentId.SetReadonly();
                }
            }
            else if (documentId is WebDocumentId webDocumentId)
            {
                throw new NotImplementedException();  // todo async?
            }
            else
            {
                throw new NotSupportedException(documentId.GetType().Name);
            }

            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(fileContent);
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

                var encoding = FileUtils.GetEncoding(filePath);
                HtmlDocument.Save(filePath, encoding);
            }
        }
    }
}

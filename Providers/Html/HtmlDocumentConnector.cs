using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlDocumentConnector : IHtmlDocumentConnector
    {
        public async Task<IHtmlDocumentHandler> ConnectAsync(IDocumentId documentId)
        {
            var pageConnector = new HtmlDocumentHandler(documentId);
            await pageConnector.LoadPageContentAsync();
            return pageConnector;
        }
    }
}

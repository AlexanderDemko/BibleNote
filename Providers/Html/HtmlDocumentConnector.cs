using System.Threading.Tasks;
using BibleNote.Providers.Html.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.Html
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

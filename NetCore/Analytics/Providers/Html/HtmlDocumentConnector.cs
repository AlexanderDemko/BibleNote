using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlDocumentConnector : IHtmlDocumentConnector
    {
        public IHtmlDocumentHandler Connect(IDocumentId documentId)
        {
            return new HtmlDocumentHandler(documentId);
        }
    }
}

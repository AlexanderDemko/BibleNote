using BibleNote.Analytics.Contracts.Providers;

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

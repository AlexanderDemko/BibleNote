using BibleNote.Analytics.Contracts.Providers;
using HtmlAgilityPack;

namespace BibleNote.Analytics.Providers.Html
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}

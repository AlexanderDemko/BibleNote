using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using HtmlAgilityPack;

namespace BibleNote.Analytics.Providers.Html.Contracts
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}

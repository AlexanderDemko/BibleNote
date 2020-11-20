using BibleNote.Services.Contracts;
using HtmlAgilityPack;

namespace BibleNote.Providers.Html.Contracts
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}

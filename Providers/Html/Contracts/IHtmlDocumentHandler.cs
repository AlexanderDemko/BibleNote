using BibleNote.Services.DocumentProvider.Contracts;
using HtmlAgilityPack;

namespace BibleNote.Providers.Html.Contracts
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}

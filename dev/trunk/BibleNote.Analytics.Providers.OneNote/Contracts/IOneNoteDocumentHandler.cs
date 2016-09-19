using BibleNote.Analytics.Contracts.Providers;
using HtmlAgilityPack;

namespace BibleNote.Analytics.Providers.OneNote.Contracts
{
    public interface IOneNoteDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}
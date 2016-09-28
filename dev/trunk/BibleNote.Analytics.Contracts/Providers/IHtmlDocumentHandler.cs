using BibleNote.Analytics.Contracts.VerseParsing;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        IXmlNode HtmlDocument { get; }
    }
}
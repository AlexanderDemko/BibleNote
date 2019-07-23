using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Contracts
{
    public interface IXDocumentHandler : IDocumentHandler
    {
        XDocument Document { get; }
    }
}

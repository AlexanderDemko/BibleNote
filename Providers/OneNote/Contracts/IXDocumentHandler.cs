using System.Xml.Linq;
using BibleNote.Services.Contracts;

namespace BibleNote.Providers.OneNote.Contracts
{
    public interface IXDocumentHandler : IDocumentHandler
    {
        XDocument Document { get; }
    }
}

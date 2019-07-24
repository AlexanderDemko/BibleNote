using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Contracts
{
    public interface IXDocumentHandler : IDocumentHandler
    {
        XDocument Document { get; }
    }
}

using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IDocumentParserFactory
    {
        IDocumentParser Create(IDocumentProviderInfo documentProvider);
    }
}

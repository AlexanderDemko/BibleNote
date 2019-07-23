using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Contracts.Providers;
using Microsoft.Practices.Unity;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParserFactory : IDocumentParserFactory
    {
        private readonly IUnityContainer _container;

        public DocumentParserFactory(IUnityContainer container)
        {
            _container = container;
        }

        public IDocumentParser Create(IDocumentProviderInfo documentProvider)
        {
            var documentParser = _container.Resolve<IDocumentParser>();
            documentParser.Init(documentProvider);
            return documentParser;
        }
    }
}

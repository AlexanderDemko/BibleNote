using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Services.VerseParsing
{
    class DocumentParserFactory : IDocumentParserFactory
    {
        private readonly IDocumentParser _documentParser;

        public DocumentParserFactory(IDocumentParser documentParser)
        {
            _documentParser = documentParser;
        }

        public IDocumentParser Create(IDocumentProviderInfo documentProvider)
        {            
            _documentParser.Init(documentProvider);
            return _documentParser;
        }
    }
}

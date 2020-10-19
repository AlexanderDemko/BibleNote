using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Services.VerseParsing
{
    class DocumentParserFactory : IDocumentParserFactory
    {
        private readonly IDocumentParser documentParser;

        public DocumentParserFactory(IDocumentParser documentParser)
        {
            this.documentParser = documentParser;
        }

        public IDocumentParser Create(IDocumentProviderInfo documentProvider, IDocumentId documentId)
        {            
            this.documentParser.Init(documentProvider, documentId);
            return documentParser;
        }
    }
}

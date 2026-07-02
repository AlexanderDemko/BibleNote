using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Contracts;

namespace BibleNote.Services.VerseParsing
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

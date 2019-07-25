using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Analytics.Services.VerseProcessing.Contracts
{
    public interface IDocumentParseResultProcessing
    {
        void Process(int documentId, DocumentParseResult documentResult);

        int Order { get; }
    }
}

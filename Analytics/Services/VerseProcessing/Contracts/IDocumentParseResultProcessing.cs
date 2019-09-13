using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System.Threading;

namespace BibleNote.Analytics.Services.VerseProcessing.Contracts
{
    public interface IDocumentParseResultProcessing
    {
        void Process(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default);

        int Order { get; }
    }
}

using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseProcessing.Contracts
{
    public interface IDocumentParseResultProcessing
    {
        Task ProcessAsync(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default);

        int Order { get; }
    }
}

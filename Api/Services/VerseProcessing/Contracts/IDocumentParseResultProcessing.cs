using System.Threading;
using System.Threading.Tasks;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseProcessing.Contracts
{
    public interface IDocumentParseResultProcessing
    {
        Task ProcessAsync(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default);

        int Order { get; }
    }
}

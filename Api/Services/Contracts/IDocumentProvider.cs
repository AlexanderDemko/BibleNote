using System.Threading.Tasks;
using BibleNote.Domain.Enums;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.Contracts
{
    public interface IDocumentProviderInfo
    {
        bool IsReadonly { get; }

        string GetVersePointerLink(VersePointer versePointer);

        FileType[] SupportedFileTypes { get; }
    }

    public interface IDocumentProvider : IDocumentProviderInfo
    {
        Task<DocumentParseResult> ParseDocumentAsync(IDocumentId documentId);
    }
}

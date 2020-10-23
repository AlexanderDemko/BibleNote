using BibleNote.Analytics.Domain.Enums;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
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

using BibleNote.Analytics.Domain.Enums;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

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
        DocumentParseResult ParseDocument(IDocumentId documentId);
    }
}

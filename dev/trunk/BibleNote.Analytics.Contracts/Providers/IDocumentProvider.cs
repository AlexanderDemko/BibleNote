using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IDocumentProviderInfo
    {
        bool IsReadonly { get; }

        string GetVersePointerLink(VersePointer versePointer);
    }

    public interface IDocumentProvider : IDocumentProviderInfo
    {
        DocumentParseResult ParseDocument(IDocumentId documentId);
    }
}

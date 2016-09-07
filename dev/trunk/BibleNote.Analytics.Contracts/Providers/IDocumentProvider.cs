using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IDocumentProvider
    {
        bool IsReadonly { get; }

        string GetVersePointerLink(VersePointer versePointer);

        DocumentParseResult ParseDocument(IDocumentId documentId);
    }
}

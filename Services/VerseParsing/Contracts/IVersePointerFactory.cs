using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IVersePointerFactory
    {
        VersePointer CreateVersePointer(string text);
        VersePointer CreateVersePointerFromLink(string verseLink);
    }
}

using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IVersePointerFactory
    {
        VersePointer CreateVersePointer(string text);        
    }
}

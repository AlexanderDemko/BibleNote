using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Models.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        private class RuleList : List<Func<VerseEntryInfo, DocumentParseContext, VersePointer>> { }

        private static Dictionary<VerseEntryType, RuleList> _funcs = new Dictionary<VerseEntryType, RuleList>()
        {
            { VerseEntryType.BookChapterVerse, new RuleList() { FullVerseRule } },
            { VerseEntryType.BookChapter,      new RuleList() { FullVerseRule } },
            { VerseEntryType.ChapterOrVerse,   new RuleList() { ChapterOrVerseRule } },
            { VerseEntryType.Verse,            new RuleList() { VerseRule } },
            { VerseEntryType.ChapterVerse,     new RuleList() { ChapterVerseRule } }
        };

        public VersePointer TryRecognizeVerse(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            if (!verseEntry.VersePointerFound)
                return null;

            foreach (var func in _funcs[verseEntry.EntryType])
            {                
                var recognizedVerse = func(verseEntry, docParseContext);
                if (recognizedVerse != null)
                    return recognizedVerse;
            }

            return null;
        }

        private static VersePointer FullVerseRule(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            return verseEntry.VersePointer;
        }

        private static VersePointer ChapterOrVerseRule(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null
                && StringUtils.CheckDivergence(docParseContext.CurrentParagraph.Text, docParseContext.LatestVerseEntry.EndIndex, verseEntry.StartIndex, 2, ','))
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;
                if (!docParseContext.LatestVerseEntry.VersePointer.VerseNumber.IsChapter)
                    verseEntry.VersePointer.VerseNumber = new VerseNumber(docParseContext.LatestVerseEntry.VersePointer.Chapter, verseEntry.VersePointer.VerseNumber.Verse);
                return verseEntry.VersePointer;
            }

            return null;
        }


        private static VersePointer ChapterVerseRule(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;
                return verseEntry.VersePointer;
            }
            else if (docParseContext.TitleVerse != null)
            {

            }

            return null;
        }

        private static VersePointer VerseRule(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;
                verseEntry.VersePointer.VerseNumber = new VerseNumber(docParseContext.LatestVerseEntry.VersePointer.Chapter, verseEntry.VersePointer.VerseNumber.Verse);
                return verseEntry.VersePointer;
            }
            else if (docParseContext.CurrentParagraph.ParentParagraph != null)
            {
            }
            else if (docParseContext.TitleVerse != null)
            {

            }

            return null;

        }
    }
}

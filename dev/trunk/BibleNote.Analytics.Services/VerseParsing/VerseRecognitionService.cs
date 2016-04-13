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
        private class RuleList : List<Func<VerseEntryInfo, IDocumentParseContext, bool>> { }

        private static Dictionary<VerseEntryType, RuleList> _funcs = new Dictionary<VerseEntryType, RuleList>()
        {
            { VerseEntryType.BookChapterVerse, new RuleList() { FullVerseRule } },
            { VerseEntryType.BookChapter,      new RuleList() { FullVerseRule } },
            { VerseEntryType.ChapterOrVerse,   new RuleList() { ChapterOrVerseRule } },
            { VerseEntryType.Verse,            new RuleList() { VerseRule } },
            { VerseEntryType.Chapter,          new RuleList() { ChapterRule } },
            { VerseEntryType.ChapterVerse,     new RuleList() { ChapterVerseRule } }
        };

        public bool TryRecognizeVerse(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (!verseEntry.VersePointerFound)
                return false;

            foreach (var func in _funcs[verseEntry.EntryType])
            {   
                if (func(verseEntry, docParseContext))
                    return true;
            }

            return false;
        }

        private static bool FullVerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            return true;
        }

        private static bool ChapterOrVerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null
                && StringUtils.CheckDivergence(docParseContext.CurrentParagraph.Text, docParseContext.LatestVerseEntry.EndIndex, verseEntry.StartIndex, 2, ','))
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;

                verseEntry.EntryType = docParseContext.LatestVerseEntry.VersePointer.VerseNumber.IsChapter ? VerseEntryType.Chapter : VerseEntryType.Verse;
                if (verseEntry.EntryType == VerseEntryType.Verse)
                {
                    verseEntry.VersePointer.VerseNumber = new VerseNumber(docParseContext.LatestVerseEntry.VersePointer.Chapter, verseEntry.VersePointer.VerseNumber.Chapter);
                    if (verseEntry.VersePointer.TopVerseNumber.HasValue && verseEntry.VersePointer.TopVerseNumber.Value.IsChapter)
                        verseEntry.VersePointer.TopVerseNumber = new VerseNumber(docParseContext.LatestVerseEntry.VersePointer.Chapter, verseEntry.VersePointer.TopVerseNumber.Value.Chapter);
                }
                                
                return true;
            }

            return false;
        }


        private static bool ChapterVerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;
                return true;
            }
            else if (docParseContext.TitleVerse != null)
            {

            }

            return false;
        }

        private static bool VerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {            
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;
                verseEntry.VersePointer.VerseNumber = new VerseNumber(docParseContext.LatestVerseEntry.VersePointer.Chapter, verseEntry.VersePointer.VerseNumber.Verse);
                return true;
            }
            else if (docParseContext.CurrentParagraph.ParentParagraph != null)
            {
            }
            else if (docParseContext.TitleVerse != null)
            {

            }

            return false;
        }

        private static bool ChapterRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                verseEntry.VersePointer.BookIndex = docParseContext.LatestVerseEntry.VersePointer.BookIndex;                
                return true;
            }            

            return false;
        }
    }
}

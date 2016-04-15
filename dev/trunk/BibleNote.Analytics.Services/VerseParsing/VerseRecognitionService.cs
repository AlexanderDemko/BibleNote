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

        /// <summary>
        /// Например, ",5-6"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool ChapterOrVerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null
                && StringUtils.CheckDivergence(docParseContext.CurrentParagraph.Text, docParseContext.LatestVerseEntry.EndIndex, verseEntry.StartIndex, 2, ','))
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;                
                verseEntry.EntryType = docParseContext.LatestVerseEntry.VersePointer.VerseNumber.IsChapter ? VerseEntryType.Chapter : VerseEntryType.Verse;

                if (verseEntry.EntryType == VerseEntryType.Verse)
                {   
                    verseEntry.VersePointer.MoveChapterToVerse(docParseContext.LatestVerseEntry.VersePointer.TopChapter);

                    if (verseEntry.VersePointer.Verse <= docParseContext.LatestVerseEntry.VersePointer.TopVerse)
                        return false;
                }
                else
                {
                    if (verseEntry.VersePointer.Chapter <= docParseContext.LatestVerseEntry.VersePointer.TopChapter)
                        return false;
                }
                                
                return true;
            }

            return false;
        }


        /// <summary>
        /// Например, "5:6"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool ChapterVerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {            
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;
                return true;
            }                        

            return false;
        }

        /// <summary>
        /// Например, ":5"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool VerseRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            VersePointer parentVerse = null;

            if (docParseContext.LatestVerseEntry != null)
            {
                parentVerse = docParseContext.LatestVerseEntry.VersePointer;
            }
            else if (docParseContext.CurrentParagraph.ParentParagraph != null)
            {
            }
            else if (docParseContext.TitleVerse != null)
            {
                parentVerse = docParseContext.TitleVerse;
            }

            if (parentVerse != null)
            {
                verseEntry.VersePointer.Book = parentVerse.Book;
                verseEntry.VersePointer.Chapter = parentVerse.TopChapter;
                return true;
            }

            return false;
        }

        /// <summary>
        /// Например, "; 5"
        /// </summary>
        /// <param name="verseEntry"></param>
        /// <param name="docParseContext"></param>
        /// <returns></returns>
        private static bool ChapterRule(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (docParseContext.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.LatestVerseEntry.VersePointer.Book;                
                return true;
            }            

            return false;
        }
    }
}

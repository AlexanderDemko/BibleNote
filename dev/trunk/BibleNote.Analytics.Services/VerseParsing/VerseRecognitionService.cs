﻿using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        private IVerseCorrectionService _verseCorrectionService;

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

        public VerseRecognitionService(IVerseCorrectionService verseCorrectionService)
        {
            _verseCorrectionService = verseCorrectionService;
        }

        public bool TryRecognizeVerse(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext)
        {
            if (!verseEntry.VersePointerFound)
                return false;

            foreach (var func in _funcs[verseEntry.EntryType])
            {
                if (func(verseEntry, docParseContext))                
                    return _verseCorrectionService.CheckAndCorrectVerse(verseEntry.VersePointer);                
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
            if (docParseContext.CurrentParagraph.LatestVerseEntry != null
                && StringUtils.CheckDivergence(docParseContext.CurrentParagraph.ParagraphParseResult.Text, docParseContext.CurrentParagraph.LatestVerseEntry.EndIndex, verseEntry.StartIndex, 2, ','))
            {
                verseEntry.VersePointer.Book = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.Book;                
                verseEntry.EntryType = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.VerseNumber.IsChapter ? VerseEntryType.Chapter : VerseEntryType.Verse;

                if (verseEntry.EntryType == VerseEntryType.Verse)
                {   
                    verseEntry.VersePointer.MoveChapterToVerse(docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.MostTopChapter);

                    if (verseEntry.VersePointer.Verse <= docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.MostTopVerse)
                        return false;
                }
                else
                {
                    if (verseEntry.VersePointer.Chapter <= docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.MostTopChapter)
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
            if (docParseContext.CurrentParagraph.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.Book;
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
            var parentVerse = docParseContext.CurrentParagraph.LatestVerseEntry?.VersePointer
                            ?? docParseContext.CurrentHierarchy?.GetHierarchyChapter()?.ChapterPointer 
                            ?? docParseContext.TitleChapter?.ChapterPointer;

            if (parentVerse != null)
            {
                verseEntry.VersePointer.Book = parentVerse.Book;
                verseEntry.VersePointer.SetChapter(parentVerse.MostTopChapter);
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
            if (docParseContext.CurrentParagraph.LatestVerseEntry != null)
            {
                verseEntry.VersePointer.Book = docParseContext.CurrentParagraph.LatestVerseEntry.VersePointer.Book;                
                return true;
            }            

            return false;
        }
    }
}

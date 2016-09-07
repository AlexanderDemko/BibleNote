using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Providers.FileNavigationProvider;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public class HtmlProvider : IDocumentProvider
    {
        private readonly IDocumentParserFactory _documentParserFactory;

        private readonly IHtmlDocumentReader _htmlDocumentReader;

        public bool IsReadonly      // наверное, этот параметр надо вынести выше - на уровень NavigationProviderInstance
        {
            get { return false; }  // а почему вообще localHtmlProvider должен отличаться от webHtmlProvider? Локальные html файлы лучше тоже не менять, а преобразовывать при отображении только.
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public HtmlProvider(IDocumentParserFactory documentParserFactory, IHtmlDocumentReader htmlDocumentReader)
        {
            _documentParserFactory = documentParserFactory;
            _htmlDocumentReader = htmlDocumentReader;
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            var result = new DocumentParseResult();
            var htmlDoc = _htmlDocumentReader.Read(documentId);

            using (var docParser = _documentParserFactory.Create(this))
            {
                using (docParser.ParseParagraph(htmlDoc.DocumentNode))
                {
                    
                }                
            }

            return result;
        }

        //private void ParseDocument(IDocumentParser docParser, HtmlNode htmlNode)
        //{
        //    if (!htmlNode.IsHierarchyNode())
        //    {
        //        AddParseString(BuildParseString(htmlNode.ChildNodes));
        //    }
        //    else
        //    {
        //        var nodes = new List<HtmlNode>();

        //        foreach (var childNode in htmlNode.ChildNodes)
        //        {
        //            if (childNode.IsTextNode())
        //            {
        //                nodes.Add(childNode);
        //                continue;
        //            }

        //            if ((childNode.HasChildNodes || childNode.Name == HtmlTags.Br) && nodes.Count > 0)
        //            {
        //                AddParseString(BuildParseString(nodes));
        //                nodes.Clear();
        //            }

        //            if (childNode.HasChildNodes)
        //                FindParseStrings(childNode);
        //        }

        //        if (nodes.Count > 0)
        //            AddParseString(BuildParseString(nodes));
        //    }
        //}
    }
}

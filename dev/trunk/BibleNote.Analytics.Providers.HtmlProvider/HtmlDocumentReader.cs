using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using HtmlAgilityPack;
using BibleNote.Analytics.Providers.FileNavigationProvider;
using System.IO;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public class HtmlDocumentReader : IHtmlDocumentReader
    {
        public HtmlDocument Read(IDocumentId documentId)
        {   
            string html = null;

            if (documentId is FileDocumentId)
            {
                var filePath = ((FileDocumentId)documentId).FilePath;
                var ext = Path.GetExtension(filePath);
                html = File.ReadAllText(filePath);

                if (ext == ".txt")
                {
                    //todo: надо обернуть каждый обзац в <p></p>
                }
            }
            //else if (documentId is WebDocumentId)
            //{

            //}

            if (html != null)
            {
                var htmlDoc = new HtmlDocument();
                htmlDoc.LoadHtml(html);
                return htmlDoc;
            }

            throw new NotSupportedException(documentId.GetType().Name);
        }
    }
}

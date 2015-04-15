using BibleNote.Analytics.Data;
using BibleNote.Analytics.Services;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNoteConsole
{    
    class Program
    {
        static void Main(string[] args)
        {
            using (var analyticsContext = new AnalyticsContext())
            {
                Console.WriteLine(analyticsContext.DocumentFolders.Count());
            }


            var doc = new HtmlDocument();
            doc.LoadHtml("test<div style='color:green' width='100px'> first text <text style='color:red' height=50px>text!!!</text>last text</div>");

            Console.WriteLine(doc.DocumentNode.ChildNodes[0].InnerText);


            Console.ReadLine();
        }
    }
}

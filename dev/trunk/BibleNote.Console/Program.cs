using BibleNote.Core.DBModel;
using BibleNote.Core.Services;
using BibleNote.Core.Services.System;
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
            var doc = new HtmlDocument();
            doc.LoadHtml("test<div style='color:green' width='100px'> first text <text style='color:red' height=50px>text!!!</text>last text</div>");

            Console.WriteLine(doc.DocumentNode.ChildNodes[0].InnerText);


            Console.ReadLine();
        }
    }
}

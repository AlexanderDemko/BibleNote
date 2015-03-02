using BibleNote.Core.DBModel;
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
            using (var entities = new IndexModel())
            {
                Console.WriteLine(entities.DocumentFolder.First().FolderName);
            }


            //var f = new DocumentFolder();
            //f.FolderName = "Test1";
            //using (var entities = new IndexModel())
            //{
            //    entities.DocumentFolder.Add(f);
            //    entities.SaveChanges();
            //}
        }
    }
}

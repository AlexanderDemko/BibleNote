using BibleNote.Core.DBModel;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Helpers
{
    public class DBHelper
    {
        public static IndexModel GetIndexModel()
        {
            return new IndexModel("name=IndexModel");
        }
    }
}

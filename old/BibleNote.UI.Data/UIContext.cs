using System;
using System.Collections.Generic;
using System.Data.Entity;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.UI.Data
{
    public class UIContext : DbContext
    {
        public UIContext()
            : base("BibleNote.UI")
        {

        }
    }
}

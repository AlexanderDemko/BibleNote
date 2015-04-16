using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Word.Model.Entities
{
    public class Word:WordObjectBase
    {
        public string Text { get; set; }
        public bool IsText { get; set; }
    }
}

Slim.tag('tree-list', class extends Slim {

    get dependencies() {
        return ['TreeModel']
    }

    get template() {
        if (this.data instanceof Array) {
            return '<span>---</span><tree-list slim-repeat="data"></tree-list>>'
        } else {
            return '<div><span bind>Text: [[data]]</span></div>'
        }
    }

    onAfterRender() {
        this.dependency.TreeModel(this)
    }

})